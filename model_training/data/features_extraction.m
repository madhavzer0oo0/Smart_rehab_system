function processed_signal = features_extraction(signal, windowsize, windowshift, nsensor_time, nsensor_freq)
%% features_extraction segment the input signals with given length and distance between segments.
% The input signals are segmented and the content of the windows are given together with their features.
% The function also presents two boxplots: 
% (1) containing the mean, max, min and std of the time domain features of signals
% (2) containing the mean, max and min of the FFT of signals
%
%  inputs:
%       signal: signals to cut. Each row is a signal and each column is a sample
%       windowsize: size of windows into the signal is cut
%       windowshift: distance between two consecutive windows
%       nsensor_time: index of the sensor whose time domain  features are shown (0 implies no representation)
%       nsensor_freq: index of the sensor whose frequency domain features are shown (0 implies no representation)
%  The last two following inputs are optional for the boxplot representation of features.
%  The default features can be changed tunning index_time_feats and index_freq_feats with the index of the features to present.
%  The index of features are indicated in the lines where the feature are obtained.

% outputs:
% processed_signal: structure that contains the segmented windows and its features, its content is organized as follows:
%       processed_signal.windows: cells that contain each window of the segmented signal
%       processed_signal.feats_sensor: columns - features obtained from each segmented window divided into rows according to
%       their corresponding sensor
%                                      rows - features that correspond to each sensor
%       processed_signal.feats_matrix: matrix that contains all features of each signal window.
%                           Each column correspond to the features of a segmented window.
%                           Each row is a feature of the coresponding window. 
%
%% The code is adapted to PHYTMO. This database can be found in zenodo:
% Sara García-de-Villa, Ana Jiménez-Martín and Juan Jesús García-Domínguez. A database of physical therapy exercises with
% variability of execution collected by wearable sensors. 

%%
    naxes =3; % Number of axes of each sensor. It is set to 3 since in the PHYTMO database, data are from triaxial sensors.

    
    for nwindow = 1:floor((size(signal,2)-windowsize)/windowshift)+1 % Obtain the segments of the signals and save them in processed_signal.windows{nwindow}
        init = 1+windowshift*(nwindow-1);
        fint = windowsize+(nwindow-1)*windowshift;
        processed_signal.windows{nwindow} = signal(:,init:fint);
   
        aux_timefeats=[];
        aux_freqfeats=[];
        for j = 1:size(processed_signal.windows{nwindow},1)/naxes
            sgnl=processed_signal.windows{nwindow}(j*naxes-(naxes-1):j*naxes,:);
            M = nchoosek(1:naxes,2);crr=zeros(size(M,1),1);
            for n = 1:size(M,1)
                crr(n,:) = corr(sgnl(M(n,1),:)',sgnl(M(n,2),:)'); % Correlation between signals. index_time_feats = 47:49.
            end
            crr_norm=zeros(naxes,1);
            spectralentropy = [];
            for n = 1:naxes
                crr_norm(n,:) = corr(sgnl(n,:)',vecnorm(sgnl)'); % Correlation between each signal and the vector norm. index_time_feats = 50:52.
                p = histcounts(sgnl(n,:), 'Normalization', 'probability');
                entropy(n,:) = -sum(p.*log2(p)); %Entropy. index_time_feats = 53:55.
                Y=abs(fft(sgnl(n,:)));
                sqrtPyy = ((sqrt(Y.*Y)*2)/length(sgnl(n,:)));
                sqrtPyy = sqrtPyy(1:round(length(sgnl(n,:))/2));
                d=sqrtPyy(:);
                d=d/sum(d+ 1e-12);
                spectralentropy(n,:) = -sum(d.*log2(d + 1e-12))/log2(length(d)); % Spectral entropy. index_freq_feats = 22:24.
            end
            time_feats=[mean(sgnl,2);... % Mean of each signal. index_time_feats = 1:3. 
                max(sgnl,[],2);... % Maximum. index_time_feats = 4:6.
                min(sgnl,[],2);... % Minimum. index_time_feats = 7:9.
                std(sgnl,0,2);... % Standard deviation of each signal. index_time_feats = 10:12.
                mean(abs(sgnl),2);... % Mean of the absolute value. index_time_feats = 13:15.
                std(sgnl,0,2).^2; ... % Variance of each signal. index_time_feats = 16:18.
                mad(sgnl,0,2);... % Mean absolute deviation. index_time_feats = 19:21.
                rms(sgnl,2);... % Root mean square. index_time_feats = 22:24.
                mean(mean(sgnl));... % Mean over 3 axes. index_time_feats = 25.
                mean(std(sgnl));... % Average standard deviation over 3 axes. index_time_feats = 26.
                skewness(sgnl,[],2);... % Skewness of each signal. index_time_feats = 27:29.
                mean(skewness(sgnl));... % Average skewness over 3 axes. index_time_feats = 30.
                kurtosis(sgnl,[],2);... % Kurtosis of each signal. index_time_feats = 31:33.
                mean(kurtosis(sgnl));... % Average kurtosis over 3 axes. index_time_feats = 34.
                quantile(sgnl,0.25,2);... % Quartile 0.25. index_time_feats = 35:37.
                quantile(sgnl,0.5,2);...  % Quartile 0.5. index_time_feats = 38:40.
                quantile(sgnl,0.75,2);... % Quartile 0.75. index_time_feats = 41:43.
                mean(sum(abs(sgnl).^2,2)/length(sgnl),2);...% Power of signlas. index_time_feats = 44:46.
                crr;crr_norm;entropy...
                ];
            freq_feat= [mean(sum(abs(fft(sgnl)).^2,2)/length(sgnl),2);... % Energy of signals. index_freq_feats = 1:3.
                abs(max(fft(sgnl),[],2));... % Absolute value of max FFT coeff. index_freq_feats = 4:6.
                abs(min(fft(sgnl),[],2));... % Absolute value of min FFT coeff. index_freq_feats = 7:9.
                max(fft(sgnl),[],2);... % Max FFT coeff. index_freq_feats = 10:12.
                mean(fft(sgnl),2);... % Mean FFT coeff. index_freq_feats = 13:15.
                median(fft(sgnl),2);... % Median FFT coeff. index_freq_feats = 16:18.
                dct(sgnl,1,2);... % Discrete cosine transform. index_freq_feats = 19:21.
                spectralentropy];
            processed_signal.feats_sensor{j,nwindow} = [time_feats; real(freq_feat)]; % Save the features of each sensor in its corresponding row (and window column)
            aux_timefeats = [aux_timefeats; time_feats];
            aux_freqfeats = [aux_freqfeats; real(freq_feat)];
        end
        processed_signal.feats_matrix(:,nwindow) = [aux_timefeats; aux_freqfeats]; % Save the features of all sensors in the window column 
    end 

    if nargin>3
        if nsensor_time >0
            indfig_time = length(time_feats)*(nsensor_time-1);
            index_time_feats = 1:12;
            figure, boxplot(processed_signal.feats_matrix(indfig_time+index_time_feats,:)', 'Labels',{'x','y','z','x','y','z','x','y','z','x','y','z'})
        end
        if nsensor_freq>0
            indfig_freq = length(aux_timefeats)+length(freq_feat)*(nsensor_time-1);
            index_freq_feats = 1:9;
            figure, boxplot(processed_signal.feats_matrix(indfig_freq+index_freq_feats,:)', 'Labels',{'x','y','z','x','y','z','x','y','z'})
        end
    end

end